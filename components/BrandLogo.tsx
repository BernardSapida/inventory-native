import { Image } from "react-native";

interface Props {
  size?: number;
  /** Kept for API compatibility; no longer used with the image logo. */
  color?: string;
  strokeWidth?: number;
}

/**
 * SmartStock brand mark - the logo image.
 * Shared across the splash screen and auth screens.
 */
export default function BrandLogo({ size = 24 }: Props) {
  return (
    <Image
      source={require("../assets/images/smartstock.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
