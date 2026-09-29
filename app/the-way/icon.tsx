import { ImageResponse } from "next/og";

// A waypoint marker (a ring with a lit center) in The Way's own navy and
// signpost orange, matching the church's path/trail-sign artwork -
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
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "5px solid #e07b35",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#e07b35",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
