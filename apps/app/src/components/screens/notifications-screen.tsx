import { useEffect } from 'react'
import { ListRow } from '@/components/list-row'
import { EmptyState, Loading, Screen, RowsSkeleton } from '@/components/screen'
import { useMarkNotificationsRead, useNotificationsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'
import { relativeTime } from '@/lib/format'

export default function NotificationsScreen() {
  const session = useSession()
  const notifications = useNotificationsQuery()
  const markRead = useMarkNotificationsRead()
  const hasUnread = notifications.data?.some((item) => !item.read) ?? false

  useEffect(() => {
    if (hasUnread && !markRead.isPending) markRead.mutate()
    // Once per visit with something unread
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread])

  if (!session.ready) return <Loading />

  return (
    <Screen back="/" title="Activity">
      {notifications.data?.length === 0 && (
        <EmptyState title="Nothing yet" body="Gifts, trades and fund updates show up here." />
      )}
      <div className="pb-6">
        {notifications.isPending && <RowsSkeleton rows={5} leading={false} />}
        {notifications.data?.map((item) => (
          <ListRow
            key={item.id}
            to={item.href ?? undefined}
            title={item.title}
            subtitle={item.body}
            valueSub={<span className="text-muted-foreground">{relativeTime(item.createdAt)}</span>}
            className={item.read ? undefined : 'bg-secondary/60'}
          />
        ))}
      </div>
    </Screen>
  )
}
