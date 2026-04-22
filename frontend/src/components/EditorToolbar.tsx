import { Editor } from "@tiptap/react";

type EditorToolbarProps = {
  editor: Editor | null;
  disabled: boolean;
};

const actions = [
  {
    label: "Bold",
    action: (editor: Editor) => editor.chain().focus().toggleBold().run(),
    active: (editor: Editor) => editor.isActive("bold"),
  },
  {
    label: "Italic",
    action: (editor: Editor) => editor.chain().focus().toggleItalic().run(),
    active: (editor: Editor) => editor.isActive("italic"),
  },
  {
    label: "Strike",
    action: (editor: Editor) => editor.chain().focus().toggleStrike().run(),
    active: (editor: Editor) => editor.isActive("strike"),
  },
  {
    label: "H1",
    action: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    active: (editor: Editor) => editor.isActive("heading", { level: 1 }),
  },
  {
    label: "H2",
    action: (editor: Editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (editor: Editor) => editor.isActive("heading", { level: 2 }),
  },
  {
    label: "Bullet",
    action: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
    active: (editor: Editor) => editor.isActive("bulletList"),
  },
  {
    label: "Numbered",
    action: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
    active: (editor: Editor) => editor.isActive("orderedList"),
  },
  {
    label: "Quote",
    action: (editor: Editor) => editor.chain().focus().toggleBlockquote().run(),
    active: (editor: Editor) => editor.isActive("blockquote"),
  },
];

const EditorToolbar = ({ editor, disabled }: EditorToolbarProps) => {
  return (
    <div className="flex flex-wrap gap-2 rounded-t-2xl border-b border-slate-800 bg-slate-900 px-4 py-3">
      {actions.map((item) => {
        const isActive = editor ? item.active(editor) : false;

        return (
          <button
            key={item.label}
            type="button"
            disabled={!editor || disabled}
            onClick={() => editor && item.action(editor)}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              isActive
                ? "bg-sky-500 text-slate-950"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
};

export default EditorToolbar;
