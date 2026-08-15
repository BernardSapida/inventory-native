import { Image } from "react-native";

interface Props {
  /** Overall size of the badge. */
  size?: number;
  /** Corner radius; defaults to a squircle-ish ~28% of size. */
  radius?: number;
  /** Kept for API compatibility; no longer used with the image logo. */
  bg?: string;
}

/**
 * SmartStock app icon - the logo image.
 * Used on the splash screen and as the sidebar brand mark.
 */
export default function BrandIcon({ size = 56, radius }: Props) {
  return (
    <Image
      source={require("../assets/images/logo.png")}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? size * 0.28,
      }}
      resizeMode="contain"
    />
  );
}
