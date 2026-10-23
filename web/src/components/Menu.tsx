"use client";

import { MenuOffice } from "./menu/MenuOffice";
import { useMenu, type MenuProps } from "./menu/useMenu";

export { TOTAL_CHOGS, randomChog } from "./menu/useMenu";

/** Title screen. */
export function Menu(props: MenuProps) {
  return <MenuOffice m={useMenu(props)} />;
}
