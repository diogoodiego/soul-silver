// Stylesheets are side-effect imports handled by Vite.
declare module "*.css";
/** A data URI: the package check allows no media files (constitution, principle II). */
declare module "*.svg?inline" {
  const uri: string;
  export default uri;
}
