"""Generate self-signed TLS cert for local iPhone testing (HTTPS required for GPS)."""

from __future__ import annotations

import datetime
import ipaddress
import subprocess
import sys
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

CERT_DIR = Path(__file__).resolve().parents[1] / "backend" / "certs"
KEY_PATH = CERT_DIR / "key.pem"
CERT_PATH = CERT_DIR / "cert.pem"
IP_FILE = CERT_DIR / "last_ip.txt"


def _local_ips() -> list[str]:
    ips: set[str] = {"127.0.0.1"}
    try:
        out = subprocess.check_output(["ipconfig"], text=True, errors="ignore")
        for line in out.splitlines():
            if "IPv4" in line and ":" in line:
                ip = line.split(":")[-1].strip()
                if ip and not ip.startswith("169.254."):
                    ips.add(ip)
    except Exception:
        pass
    if len(sys.argv) > 1 and sys.argv[1] not in ("--force", "-f"):
        ips.add(sys.argv[1])
    return sorted(ips)


def _should_regenerate(ips: list[str], force: bool) -> bool:
    if force or not KEY_PATH.exists() or not CERT_PATH.exists():
        return True
    if not IP_FILE.exists():
        return True
    saved = IP_FILE.read_text(encoding="utf-8").strip()
    return saved != ",".join(ips)


def main() -> None:
    force = "--force" in sys.argv or "-f" in sys.argv
    ips = _local_ips()
    CERT_DIR.mkdir(parents=True, exist_ok=True)

    if not _should_regenerate(ips, force):
        print(f"[OK] SSL certs OK for {', '.join(ips)}")
        return

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, "rutrix-local")]
    )
    san: list[x509.GeneralName] = [
        x509.DNSName("localhost"),
        x509.DNSName("rutrix.local"),
    ]
    for ip in ips:
        try:
            san.append(x509.IPAddress(ipaddress.ip_address(ip)))
        except ValueError:
            pass

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=825))
        .add_extension(x509.SubjectAlternativeName(san), critical=False)
        .sign(key, hashes.SHA256())
    )

    KEY_PATH.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    CERT_PATH.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    IP_FILE.write_text(",".join(ips), encoding="utf-8")
    print(f"[OK] SSL certs created for: {', '.join(ips)}")


if __name__ == "__main__":
    main()
