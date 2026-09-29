import { ImageResponse } from "next/og";
import { LEGACY_CHURCH_MARK_DATA_URI } from "@/lib/way/brandMark";

// Legacy Church Abingdon's own cross mark on The Way's navy background -
// deliberately unlike Angle Team Toolkit's amber arrow mark - this route
// segment's icon overrides the root app's for every /the-way page,
// including "Add to Home Screen".
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 14,
        }}
      >
        <img src={LEGACY_CHURCH_MARK_DATA_URI} width={30} height={41} alt="" />
      </div>
    ),
    { ...size }
  );
}
