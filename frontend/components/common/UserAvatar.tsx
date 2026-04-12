"use client";

import { useState } from "react";

interface UserAvatarProps {
  fullName?: string;
  email: string;
  profilePictureUrl?: string | null;
  gravatarUrl?: string | null;
  size?: number;
  className?: string;
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name[0]?.toUpperCase() || "U";
  }
  return email?.[0]?.toUpperCase() || "U";
}

export function UserAvatar({
  fullName,
  email,
  profilePictureUrl,
  gravatarUrl,
  size = 32,
  className = "",
}: UserAvatarProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(
    profilePictureUrl || gravatarUrl || null
  );
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    if (imgSrc === profilePictureUrl && gravatarUrl) {
      setImgSrc(gravatarUrl);
    } else {
      setFailed(true);
    }
  };

  if (!failed && imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        width={size}
        height={size}
        onError={handleError}
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const textSize = size >= 40 ? "text-sm" : "text-xs";

  return (
    <div
      className={`rounded-full bg-dashboard-accent/20 flex items-center justify-center text-dashboard-accent font-semibold ${textSize} ${className}`}
      style={{ width: size, height: size }}
    >
      {getInitials(fullName, email)}
    </div>
  );
}
