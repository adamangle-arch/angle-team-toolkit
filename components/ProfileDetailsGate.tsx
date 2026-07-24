"use client";

import type { User } from "@supabase/supabase-js";
import ProfileForm from "./ProfileForm";
import type { Profile } from "@/lib/types";

export default function ProfileDetailsGate({
  user,
  profile,
  onDone,
}: {
  user: User;
  profile: Profile;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col px-4 py-6">
      <div className="mx-auto w-full max-w-xs space-y-1 pb-4 text-center">
        <p className="text-2xl font-bold text-white">Tell the team about you</p>
        <p className="text-sm text-slate-400">
          Shows up when teammates tap your name on the Leaderboard. Totally optional — skip it and
          fill it in later from My Profile.
        </p>
      </div>
      <div className="mx-auto w-full max-w-xs">
        <ProfileForm userId={user.id} profile={profile} onDone={onDone} showSkip />
      </div>
    </div>
  );
}
