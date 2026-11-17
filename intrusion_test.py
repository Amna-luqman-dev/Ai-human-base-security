import os
import time

import cv2

from camera_detector import analyze_frame, draw_roi


ARMED = True
MONITORING_ENABLED = True
ALERT_CONFIDENCE_THRESHOLD = 0.50
ALERT_COOLDOWN_SECONDS = 2.0
last_alert_time = 0.0
intrusion_active = False


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
            return cap
        if cap is not None:
            cap.release()
    return None


def main():
    global last_alert_time, intrusion_active

    cap = open_capture()
    if cap is None:
        print("No valid camera source found. Set CAMERA_SOURCE to a working webcam index or RTSP URL.")
        return

    print("Intrusion detection started. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Could not read frame from camera.")
            break

        roi = draw_roi(frame)
        detection = analyze_frame(frame, roi=roi, include_roi=True)
        person_detected = detection["person_detected"]
        best_confidence = detection["confidence"]
        has_intrusion = person_detected and best_confidence >= ALERT_CONFIDENCE_THRESHOLD

        now = time.monotonic()
        if has_intrusion:
            if not intrusion_active and (now - last_alert_time) >= ALERT_COOLDOWN_SECONDS:
                last_alert_time = now
                intrusion_active = True
                print("INTRUSION DETECTED")
                cv2.putText(frame, "INTRUSION DETECTED", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        else:
            intrusion_active = False

        cv2.imshow("Intrusion Alert Detection", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
