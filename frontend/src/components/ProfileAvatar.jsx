export default function ProfileAvatar({ meta, fallback, className = 'avatar', style }) {
  const hasPhoto = Boolean(meta?.photo)

  return (
    <div
      className={`${className}${hasPhoto ? ' has-photo' : ''}`}
      style={{ ...style, background: hasPhoto ? undefined : (meta?.color || '#59657b') }}
      aria-hidden="true"
    >
      {hasPhoto ? (
        <img
          src={meta.photo}
          alt=""
          className={meta.photoSide === 'right' ? 'profile-right' : 'profile-left'}
        />
      ) : fallback}
    </div>
  )
}
