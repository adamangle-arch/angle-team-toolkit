import { ImageResponse } from "next/og";

// Same waypoint mark as icon.tsx, at Apple's expected touch-icon size -
// this is what shows on the iOS home screen after "Add to Home Screen".
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1625",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            border: "14px solid #d98c4a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#d98c4a",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
