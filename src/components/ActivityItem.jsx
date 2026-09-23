import { activityCopy, activityTime } from '../activityPresentation'

export default function ActivityItem({ item, actor, onActivate, busy }) {
  const time = activityTime(item.createdAt)
  return <li className={`activity-item${item.isRead ? '' : ' activity-unread'}`}>
    <button type="button" disabled={busy} onClick={() => onActivate(item)}>
      <span className="activity-dot" aria-hidden="true" />
      <span><span className="activity-copy">{activityCopy(item, actor)}</span>
        <span className="activity-sr-only">{item.isRead ? 'Leída.' : 'Sin leer.'}</span>
        <time dateTime={time.dateTime} title={time.title}>{time.label}</time>
      </span>
    </button>
  </li>
}
