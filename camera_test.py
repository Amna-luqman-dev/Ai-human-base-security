import argparse
import os

import cv2


def parse_source(value):
    try:
        return int(value)
    except ValueError:
        return value


def open_capture(source):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        cap.release()
        print(f"Camera not available for source: {source}")
        return None

    return cap


def main():
    parser = argparse.ArgumentParser(description="Preview a live security camera feed.")
    parser.add_argument(
        "--source",
        default=os.getenv("CAMERA_SOURCE", "0"),
        help="Camera index (such as 0) or stream URL. Defaults to CAMERA_SOURCE or 0.",
    )
    args = parser.parse_args()
    source = parse_source(args.source)

    cap = open_capture(source)
    if cap is None:
        print("Connect a webcam, try another --source index, or set CAMERA_SOURCE to a device index or stream URL.")
        return 1

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"Camera opened: source={source}, resolution={width}x{height}, fps={fps:.1f}")
    print("Press Q in the camera window to quit.")

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Could not read a frame from the camera. Check the connection or camera source.")
                return 1

            cv2.imshow("Camera Feed", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                return 0
    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    raise SystemExit(main())
