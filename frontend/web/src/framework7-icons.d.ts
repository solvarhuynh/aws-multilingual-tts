// Framework7 cung cấp SVG React nhưng chưa kèm kiểu TypeScript.
declare module "framework7-icons/react/esm/*.js" {
  import type { ComponentType, SVGProps } from "react";
  const Icon: ComponentType<SVGProps<SVGSVGElement>>;
  export default Icon;
}
