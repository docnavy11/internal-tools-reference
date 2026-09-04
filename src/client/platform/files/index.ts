// The files kit. Anything that shows or picks an uploaded file imports from here.
export { AttachmentLink } from '@/client/platform/files/attachment-link';
export { FilePicker, type FilePickerProps } from '@/client/platform/files/file-picker';
export {
  fileKind,
  formatBytes,
  isImage,
  isInline,
  matchesAccept,
  type FileKind,
} from '@/client/platform/files/format';
