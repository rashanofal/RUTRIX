"""Snap map buffers to nearest OpenStreetMap road bearing."""

from __future__ import annotations

import logging
import math
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_bearing_cache: dict[str, float | None] = {}

R_EARTH = 6_371_000


def _cache_key(lat: float, lon: float) -> str:
    return f"{round(lat, 5)},{round(lon, 5)}"


def _bearing_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δλ = math.radians(lon2 - lon1)
    y = math.sin(Δλ) * math.cos(φ2)
    x = math.cos(φ1) * math.sin(φ2) - math.sin(φ1) * math.cos(φ2) * math.cos(Δλ)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def _point_to_segment_distance_m(
    plat: float, plon: float, alat: float, alon: float, blat: float, blon: float
) -> float:
    """Approximate distance from point to segment in meters."""
    dx = blat - alat
    dy = blon - alon
    if dx == 0 and dy == 0:
        return _haversine_m(plat, plon, alat, alon)
    t = max(
        0.0,
        min(
            1.0,
            ((plat - alat) * dx + (plon - alon) * dy) / (dx * dx + dy * dy + 1e-12),
        ),
    )
    proj_lat = alat + t * dx
    proj_lon = alon + t * dy
    return _haversine_m(plat, plon, proj_lat, proj_lon)


def _bearing_from_overpass(data: dict[str, Any], lat: float, lon: float) -> float | None:
    best_dist = float("inf")
    best_bearing: float | None = None
    for el in data.get("elements", []):
        if el.get("type") != "way":
            continue
        geom = el.get("geometry") or []
        for i in range(len(geom) - 1):
            a, b = geom[i], geom[i + 1]
            dist = _point_to_segment_distance_m(
                lat, lon, a["lat"], a["lon"], b["lat"], b["lon"]
            )
            if dist < best_dist:
                best_dist = dist
                best_bearing = _bearing_between(a["lat"], a["lon"], b["lat"], b["lon"])
    if best_bearing is None or best_dist > 45:
        return None
    return best_bearing


async def fetch_road_bearing(lat: float, lon: float, radius_m: int = 40) -> float | None:
    """Return road axis bearing (degrees) at a point using OSM highway geometry."""
    key = _cache_key(lat, lon)
    if key in _bearing_cache:
        return _bearing_cache[key]

    query = f"""
    [out:json][timeout:8];
    way(around:{radius_m},{lat},{lon})
      ["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)$"];
    out geom;
    """
    bearing: float | None = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(OVERPASS_URL, data={"data": query})
            res.raise_for_status()
            bearing = _bearing_from_overpass(res.json(), lat, lon)
    except Exception as exc:
        logger.warning("OSM road bearing failed at %s,%s: %s", lat, lon, exc)

    _bearing_cache[key] = bearing
    return bearing


async def fetch_road_bearings_batch(points: list[dict]) -> dict[str, float | None]:
    """Batch lookup — keys are string ids or lat,lon."""
    out: dict[str, float | None] = {}
    for p in points:
        pid = p.get("id")
        lat, lon = float(p["latitude"]), float(p["longitude"])
        key = str(pid) if pid is not None else _cache_key(lat, lon)
        out[key] = await fetch_road_bearing(lat, lon)
    return out
