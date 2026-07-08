"""Extract GPS coordinates from image EXIF metadata."""

from __future__ import annotations

import io

from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass


def _ratio_to_float(value) -> float:
    if isinstance(value, tuple) and len(value) == 2:
        return float(value[0]) / float(value[1]) if value[1] else 0.0
    if hasattr(value, "numerator"):
        return float(value)
    return float(value)


def _dms_to_decimal(dms, ref: str) -> float | None:
    try:
        degrees = _ratio_to_float(dms[0])
        minutes = _ratio_to_float(dms[1])
        seconds = _ratio_to_float(dms[2])
        decimal = degrees + minutes / 60.0 + seconds / 3600.0
        if ref in ("S", "W"):
            decimal = -decimal
        return decimal
    except (IndexError, TypeError, ValueError, ZeroDivisionError):
        return None


def _gps_from_ifd(gps_ifd: dict) -> tuple[float | None, float | None]:
    if not gps_ifd:
        return None, None

    lat_ref = gps_ifd.get(1, "N")
    lon_ref = gps_ifd.get(3, "E")
    lat_dms = gps_ifd.get(2)
    lon_dms = gps_ifd.get(4)

    if lat_dms is None or lon_dms is None:
        return None, None

    lat = _dms_to_decimal(lat_dms, lat_ref if isinstance(lat_ref, str) else "N")
    lon = _dms_to_decimal(lon_dms, lon_ref if isinstance(lon_ref, str) else "E")

    if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
        return lat, lon
    return None, None


def _gps_from_pillow_exif(exif) -> tuple[float | None, float | None]:
    if not exif:
        return None, None

    gps_tag = next((k for k, v in TAGS.items() if v == "GPSInfo"), None)
    if gps_tag is not None and gps_tag in exif:
        gps_ifd = exif.get_ifd(gps_tag)
        lat, lon = _gps_from_ifd(gps_ifd)
        if lat is not None:
            return lat, lon

    # Legacy _getexif format
    raw = exif if isinstance(exif, dict) else None
    if raw:
        gps_raw = raw.get(34853) or raw.get("GPSInfo")
        if isinstance(gps_raw, dict):
            named = {}
            for key, val in gps_raw.items():
                tag = GPSTAGS.get(key, key)
                named[tag] = val
            lat, lon = _gps_from_ifd({
                1: named.get("GPSLatitudeRef", "N"),
                2: named.get("GPSLatitude"),
                3: named.get("GPSLongitudeRef", "E"),
                4: named.get("GPSLongitude"),
            })
            if lat is not None:
                return lat, lon

    return None, None


def _gps_from_exifread(content: bytes) -> tuple[float | None, float | None]:
    try:
        import exifread

        tags = exifread.process_file(io.BytesIO(content), details=False)
        if not tags:
            return None, None

        lat_vals = tags.get("GPS GPSLatitude")
        lon_vals = tags.get("GPS GPSLongitude")
        lat_ref = str(tags.get("GPS GPSLatitudeRef", "N"))
        lon_ref = str(tags.get("GPS GPSLongitudeRef", "E"))
        if not lat_vals or not lon_vals:
            return None, None

        def parse_ratio(values):
            parts = []
            for v in values.values:
                parts.append(float(v.num) / float(v.den) if v.den else 0.0)
            return parts

        lat = _dms_to_decimal(parse_ratio(lat_vals), lat_ref.strip())
        lon = _dms_to_decimal(parse_ratio(lon_vals), lon_ref.strip())
        if lat is not None and lon is not None:
            return lat, lon
    except Exception:
        pass
    return None, None


def normalize_image_for_processing(content: bytes) -> bytes:
    """Convert phone uploads (HEIC, PNG, rotated JPEG) to standard JPEG."""
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue()
    except Exception:
        return content


def extract_gps_from_bytes(content: bytes) -> tuple[float | None, float | None]:
    """Return (latitude, longitude) from image EXIF or (None, None)."""
    try:
        img = Image.open(io.BytesIO(content))
        exif = img.getexif()
        lat, lon = _gps_from_pillow_exif(exif)
        if lat is not None:
            return lat, lon

        legacy = getattr(img, "_getexif", lambda: None)()
        lat, lon = _gps_from_pillow_exif(legacy)
        if lat is not None:
            return lat, lon
    except Exception:
        pass

    return _gps_from_exifread(content)


def extract_gps_from_file(path: str) -> tuple[float | None, float | None]:
    with open(path, "rb") as f:
        return extract_gps_from_bytes(f.read())
