/** The scripts the editor puts into what it saves, bundled and minified by the `bone2d:bundles` plugin of vite.config.ts. */
declare module 'virtual:bone2d-player' {
  const source: string;
  export default source;
}

declare module 'virtual:bone2d-runtime' {
  /** The player module of the web game export. */
  const source: string;
  export default source;
  /** Its type declarations. */
  export const types: string;
}
