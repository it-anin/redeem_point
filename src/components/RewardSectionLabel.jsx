import './RewardSectionLabel.css'

const ICON_PATHS = {
  star: <path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.1-5.5-2.9-5.5 2.9 1.1-6.1L3.1 9.5l6.2-.9Z" />,
  spark: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5ZM20 2v4m-2-2h4" />,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  gift: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M3 7h18v4H3zM12 7v14M12 7H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></>,
}

function LabelIcon({ name }) {
  return (
    <svg className="reward-section-label__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[name]}
    </svg>
  )
}

export default function RewardSectionLabel({ type = 'normal' }) {
  const special = type === 'special'

  return (
    <div className="reward-section-heading">
      <h2 className={`reward-section-label reward-section-label--${special ? 'special' : 'normal'}`}>
        <span className="reward-section-label__star" aria-hidden="true"><LabelIcon name="spark" /></span>
        <span className="reward-section-label__icon" aria-hidden="true"><LabelIcon name={special ? 'star' : 'gift'} /></span>
        <span className="reward-section-label__text">{special ? 'รางวัลพิเศษ' : 'รางวัลปกติ'}</span>
        <span className="reward-section-label__heart" aria-hidden="true"><LabelIcon name="heart" /></span>
      </h2>
    </div>
  )
}
