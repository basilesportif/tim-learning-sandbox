import './TriangleGlyph.css';

// Isosceles triangle, apex pointing up, centred on (100, 100).
export const TRIANGLE_POINTS = '100,34 154,152 46,152';

// The one and only triangle drawing: body + face + red "nose" marker on the
// apex, so a child can tell which corner used to point up. Shared by the free
// rotate stage and by every pattern snapshot.
const TriangleGlyph = ({ className = '' }) => {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true">
      <polygon className="shape-body" points={TRIANGLE_POINTS} />
      <circle className="shape-eye" cx="86" cy="98" r="7" />
      <circle className="shape-eye" cx="114" cy="98" r="7" />
      <path className="shape-smile" d="M 83 122 Q 100 137 117 122" />
      <circle className="shape-nose" cx="100" cy="34" r="12" />
    </svg>
  );
};

export default TriangleGlyph;
