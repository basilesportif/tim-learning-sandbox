import { useState } from 'react';
import { avatarPalette, photoUrl } from '../lib/avatars';
import './PlayerAvatar.css';

// One square tile: the player's photo if public/photos/<slug>.jpg exists,
// otherwise a generated letter avatar. The parent gives this a key of the
// player's slug, so every new card starts by trying the photo again.
//
// The image is intentionally unlabelled (alt=""): the player's name is the
// answer, so it must not leak through alt text or a broken-image label.
function PlayerAvatar({ player }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [background, ink] = avatarPalette(player.slug);

  return (
    <div className="player-avatar">
      {photoFailed ? (
        <div className="player-avatar-letter" style={{ background, color: ink }} aria-hidden="true">
          {player.first.charAt(0)}
        </div>
      ) : (
        <img
          className="player-avatar-photo"
          src={photoUrl(player.slug)}
          alt=""
          draggable="false"
          onError={() => setPhotoFailed(true)}
        />
      )}
    </div>
  );
}

export default PlayerAvatar;
