import os

import cv2
from ultralytics import YOLO


def open_capture():
    source = os.getenv("CAMERA_SOURCE", "0")
    try:
        source_value = int(source)
    except ValueError:
        source_value = source

    backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]

    for backend in backends:
        try:
            cap = cv2.VideoCapture(source_value, backend)
        except Exception:
            cap = None

        if cap is not None and cap.isOpened():
            print(f"Camera opened using backend: {backend}")
            return cap

        if cap is not None:
            cap.release()

    print(f"Camera not available for source: {source}")
    return None


def main():
    model = YOLO("yolov8n.pt")
    cap = open_capture()
    if cap is None:
        print("No camera available. Connect a webcam or set CAMERA_SOURCE to a valid device index or RTSP URL.")
        return

    print("YOLO person detection started. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Could not read frame from camera.")
            break

        results = model(frame, imgsz=320, conf=0.45, verbose=False)
        person_found = False

        for result in results:
            for box in result.boxes:
                cls = int(box.cls[0])
                label = model.names[cls]
                conf = float(box.conf[0])

                if label != "person":
                    continue

                person_found = True
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(
                    frame,
                    f"person {conf:.2f}",
                    (x1, max(y1 - 10, 20)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )

        if person_found:
            print("Person detected: drawing green box.")

        cv2.imshow("YOLO Person Detection", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
