import { DocComment } from "../types";

type EditorCommentCardProps = {
  comment: DocComment;
  currentUserEmail: string;
  isOwner: boolean;
  editing: boolean;
  editingBody: string;
  deleting: boolean;
  compact?: boolean;
  isReply?: boolean;
  onEditingBodyChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onFocus: () => void;
  onReply: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onToggleResolved: () => void;
};

const EditorCommentCard = ({
  comment,
  currentUserEmail,
  isOwner,
  editing,
  editingBody,
  deleting,
  compact = false,
  isReply = false,
  onEditingBodyChange,
  onSave,
  onCancelEdit,
  onFocus,
  onReply,
  onStartEdit,
  onDelete,
  onToggleResolved,
}: EditorCommentCardProps) => {
  const canManage = isOwner || comment.author.email.toLowerCase() === currentUserEmail.toLowerCase();
  const buttonClass = compact
    ? "flex w-full items-center justify-center gap-1 rounded border border-white/10 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition active:border-primary/40 active:text-primary"
    : "flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant transition hover:border-primary/40 hover:text-primary";

  return (
    <div className={`space-y-3 rounded-lg border-l-2 bg-surface-container p-4 shadow-sm ${isReply ? "ml-5 border-l-white/20" : ""} ${comment.resolved ? "border-white/10 opacity-75" : "border-primary"}`}>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-highest text-[10px] uppercase text-white">
          {comment.author.email.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold text-white">{comment.author.email}</div>
          <div className="text-[9px] text-[#a3a3a3]">{new Date(comment.createdAt).toLocaleString()}</div>
        </div>
      </div>
      {isReply ? <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Thread reply</p> : null}
      {editing ? (
        <div className="space-y-2">
          <textarea className="emerald-input min-h-[82px] resize-none text-xs" value={editingBody} onChange={(event) => onEditingBodyChange(event.target.value)} />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={onSave} className="emerald-primary-button justify-center px-3 py-2 text-[10px]">Save</button>
            <button type="button" onClick={onCancelEdit} className="emerald-muted-button justify-center px-3 py-2 text-[10px]">Cancel</button>
          </div>
        </div>
      ) : <p className="text-xs leading-relaxed text-[#bbcabf]">{comment.body}</p>}
      {comment.position?.text ? (
        <button type="button" onClick={onFocus} className="w-full rounded border border-white/10 bg-surface-container-high px-2 py-2 text-left text-[11px] text-on-surface-variant transition hover:border-primary/40 hover:text-primary">
          Linked: "{comment.position.text}"
        </button>
      ) : null}
      <div className={compact ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
        <button type="button" onClick={onReply} className={buttonClass}><span className="material-symbols-outlined text-[14px]">reply</span>Reply</button>
        <button type="button" onClick={onToggleResolved} className={buttonClass}><span className="material-symbols-outlined text-[14px]">{comment.resolved ? "undo" : "task_alt"}</span>{comment.resolved ? "Reopen" : "Resolve"}</button>
        {canManage ? (
          <>
            <button type="button" onClick={onStartEdit} className={buttonClass}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
            <button type="button" onClick={onDelete} disabled={deleting} className={`${buttonClass} border-error/20 text-error hover:bg-error-container/20 disabled:opacity-50`}><span className="material-symbols-outlined text-[14px]">{deleting ? "hourglass_empty" : "delete"}</span>Delete</button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default EditorCommentCard;
