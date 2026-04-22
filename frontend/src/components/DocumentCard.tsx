import { DocItem } from "../store/docStore";

type DocumentCardProps = {
  document: DocItem;
  onOpen: (id: string) => void;
};

const roleStyles: Record<DocItem["role"], string> = {
  owner: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  editor: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  viewer: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

const DocumentCard = ({ document, onOpen }: DocumentCardProps) => {
  return (
    <button
      type="button"
      onClick={() => onOpen(document.id)}
      className="card flex w-full flex-col gap-4 p-5 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{document.title}</h3>
          <p className="mt-1 text-sm text-slate-400">Owner: {document.owner.email}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${roleStyles[document.role]}`}>
          {document.role}
        </span>
      </div>

      <div className="text-sm text-slate-400">
        <p>{document.collaborators.length} collaborators</p>
        <p className="mt-1">Updated {new Date(document.updatedAt).toLocaleString()}</p>
      </div>
    </button>
  );
};

export default DocumentCard;
