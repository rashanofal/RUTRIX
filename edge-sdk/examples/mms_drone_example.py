"""
Example: MMS / Drone integration with hybrid detection.

Usage:
  python examples/mms_drone_example.py --image path/to/frame.jpg --lat 30.04 --lon 31.23
  python examples/mms_drone_example.py --video path/to/flight.mp4 --device drone
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pothole_sdk import EdgeDetector, OfflineQueue, PotholeClient


def main():
    parser = argparse.ArgumentParser(description="MMS/Drone pothole detection example")
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--model", default=str(ROOT.parent / "ml" / "models" / "pothole_yolov8n.onnx"))
    parser.add_argument("--device", choices=["mms", "drone"], default="mms")
    parser.add_argument("--image", type=str, help="Single image path")
    parser.add_argument("--video", type=str, help="Video path")
    parser.add_argument("--lat", type=float, default=None)
    parser.add_argument("--lon", type=float, default=None)
    parser.add_argument("--bearing", type=float, default=None)
    parser.add_argument("--sync", action="store_true", help="Sync pending offline uploads")
    args = parser.parse_args()

    queue = OfflineQueue(db_path=str(ROOT / "pothole_queue.db"))
    client = PotholeClient(
        base_url=args.api,
        device_type=args.device,
        offline_queue=queue,
    )

    if args.sync:
        results = client.sync_pending()
        print(f"Synced {len(results)} pending upload(s)")
        return

    print(f"API health: {client.health()}")

    if not Path(args.model).exists():
        print(f"Warning: ONNX model not found at {args.model}")
        print("Run: python ml/export_onnx.py")

    detector = EdgeDetector(args.model, frame_interval=5)

    if args.image:
        result = client.process_and_upload(
            args.image, detector, args.lat, args.lon, args.bearing
        )
        print(result)
    elif args.video:
        def gps_cb(frame_idx):
            # In production: read GPS from MMS/drone telemetry log
            return args.lat, args.lon, args.bearing

        dets = detector.process_video(args.video, gps_callback=gps_cb)
        print(f"Edge detected {len(dets)} pothole(s) in video")
        # Upload first frame with detections as sample
        if dets:
            import cv2
            cap = cv2.VideoCapture(args.video)
            cap.set(cv2.CAP_PROP_POS_FRAMES, dets[0]["frame_index"])
            ret, frame = cap.read()
            if ret:
                tmp = ROOT / "tmp_frame.jpg"
                cv2.imwrite(str(tmp), frame)
                result = client.process_and_upload(
                    str(tmp), detector, args.lat, args.lon, args.bearing
                )
                print(result)
            cap.release()
    else:
        parser.print_help()

    client.close()


if __name__ == "__main__":
    main()
