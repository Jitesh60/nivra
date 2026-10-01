/**
 * A light that travels round the parent's border. The parent needs
 * `relative` and a border radius. Adapted from Magic UI "BorderBeam"
 * (magicui.design, MIT), drawn with CSS (see .border-beam).
 */
export function BorderBeam() {
  return <span aria-hidden className="border-beam" />;
}
