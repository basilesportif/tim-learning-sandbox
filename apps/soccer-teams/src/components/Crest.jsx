import { useState } from 'react';
import { badgePalette, initials } from '../lib/format';
import './Crest.css';

// A club crest on a white tile, so dark crests (Juventus is solid black on
// transparent) stay visible against the dark app background. If the logo is
// missing or fails to load, a colored initials badge takes its place. The
// parent keys this by slug, so every new card tries the image again.
function Crest({ team, size = 'large' }) {
  const [failed, setFailed] = useState(false);
  const [background, ink] = badgePalette(team.slug);
  const showImage = team.logo && !failed;

  return (
    <div className={`crest crest--${size}`}>
      {showImage ? (
        <img
          className="crest-image"
          src={`${import.meta.env.BASE_URL}${team.logo}`}
          alt={`${team.name} crest`}
          draggable="false"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="crest-badge" style={{ background, color: ink }} role="img" aria-label={`${team.name} badge`}>
          {initials(team.shortName || team.name)}
        </div>
      )}
    </div>
  );
}

export default Crest;
