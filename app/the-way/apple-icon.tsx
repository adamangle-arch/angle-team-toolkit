import { ImageResponse } from "next/og";
import { LEGACY_CHURCH_MARK_DATA_URI } from "@/lib/way/brandMark";

// Same mark as icon.tsx, at Apple's expected touch-icon size - this is
// what shows on the iOS home screen after "Add to Home Screen".
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
          background: "#16283f",
        }}
      >
        <img src={LEGACY_CHURCH_MARK_DATA_URI} width={86} height={118} alt="" />
      </div>
    ),
    { ...size }
  );
}
