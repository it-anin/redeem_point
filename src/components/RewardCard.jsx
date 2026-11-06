import './RewardCard.css'

const ICON_PATHS = {
  star: <path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.1-5.5-2.9-5.5 2.9 1.1-6.1L3.1 9.5l6.2-.9Z" />,
  spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5ZM20 2v4m-2-2h4" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  gift: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M3 7h18v4H3zM12 7v14M12 7H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></>,
  infinity: <path d="M12 12s-3-5-6-5a5 5 0 0 0 0 10c3 0 6-5 6-5s3-5 6-5a5 5 0 0 1 0 10c-3 0-6-5-6-5Z" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pause: <path d="M9 5v14M15 5v14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
}

function DoodleIcon({ name }) {
  return (
    <svg className="reward-doodle__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  )
}

export default function RewardCard({ reward, state, disabled, buttonLabel, onRedeem }) {
  const special = reward.type === 'special'
  const outOfStock = !reward.unlimited && reward.stock === 0
  const valueIndex = reward.name?.indexOf('มูลค่า') ?? -1
  const actionIcon = state === 'scheduled' ? 'clock' : state === 'paused' ? 'pause' : outOfStock ? 'close' : 'arrow'

  return (
    <article className="reward-doodle" data-state={state} aria-label={reward.name}>
      <span className={`reward-doodle__stock${outOfStock ? ' is-empty' : !reward.unlimited && reward.stock <= 3 ? ' is-low' : ''}`}>
        <DoodleIcon name={reward.unlimited ? 'infinity' : outOfStock ? 'close' : 'gift'} />
        {reward.unlimited ? 'ไม่จำกัด' : outOfStock ? 'หมดแล้ว' : `เหลือ ${reward.stock}`}
      </span>
      <span className="reward-doodle__decoration reward-doodle__decoration--star" aria-hidden="true"><DoodleIcon name="spark" /></span>
      <span className="reward-doodle__decoration reward-doodle__decoration--heart" aria-hidden="true"><DoodleIcon name="heart" /></span>
      <div className="reward-doodle__media">
        {reward.image ? <img src={reward.image} alt={reward.name} /> : <span aria-hidden="true">{reward.emoji ?? '🎁'}</span>}
      </div>
      <div className="reward-doodle__info">
        <h3>{valueIndex > 0 ? reward.name.slice(0, valueIndex).trim() : reward.name}</h3>
        {valueIndex > 0 && <p>{reward.name.slice(valueIndex).trim()}</p>}
      </div>
      <span className={`reward-doodle__type${special ? ' is-special' : ''}`}>
        <DoodleIcon name={special ? 'star' : 'gift'} />
        {special ? 'รางวัลพิเศษ' : 'รางวัลปกติ'}
      </span>
      {reward.description && <p className="reward-doodle__description">{reward.description}</p>}
      <div className="reward-doodle__cost">
        <DoodleIcon name="star" />
        <strong>{reward.pointCost?.toLocaleString()}</strong>
        <span>แต้ม</span>
      </div>
      <button type="button" className="reward-doodle__redeem" disabled={disabled} onClick={onRedeem} aria-label={`${buttonLabel} — ${reward.name}`}>
        <DoodleIcon name={actionIcon} />
        <span>{buttonLabel}</span>
      </button>
    </article>
  )
}
