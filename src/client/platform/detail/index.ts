// The detail kit. A feature's detail.tsx imports from here, plus shadcn `tabs` for
// the tab strip.
export {
  AuditDiff,
  DiffValue,
  diffRecords,
  type ChangeKind,
  type FieldChange,
} from '@/client/platform/detail/audit-diff';
export { DetailPage } from '@/client/platform/detail/detail-page';
export { FieldList, type FieldListItem } from '@/client/platform/detail/field-list';
export {
  HistoryTab,
  HistoryTimeline,
  actorLabel,
  humanizeAction,
  useHistory,
} from '@/client/platform/detail/history';
