import type { SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import CommandList from './CommandList';

const suggestion: Omit<SuggestionOptions<any>, 'editor'> = {
  char: '/',
  command: ({ editor, range, props }: any) => {
    props.command({ editor, range });
  },
  items: ({ query }: { query: string }) => {
    const commands = [
      {
        title: 'Paragraph',
        description: 'Reset the current block to body text',
        icon: 'notes',
        aliases: ['body', 'text'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).setParagraph().run();
        },
      },
      {
        title: 'Heading 1',
        description: 'Large section title',
        icon: 'format_h1',
        aliases: ['title', 'h1'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
        },
      },
      {
        title: 'Heading 2',
        description: 'Medium section title',
        icon: 'format_h2',
        aliases: ['subtitle', 'h2'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
        },
      },
      {
        title: 'Heading 3',
        description: 'Small section title',
        icon: 'format_h3',
        aliases: ['h3'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
        },
      },
      {
        title: 'Bullet List',
        description: 'Create an unordered list',
        icon: 'format_list_bulleted',
        aliases: ['ul', 'list'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        },
      },
      {
        title: 'Numbered List',
        description: 'Create an ordered list',
        icon: 'format_list_numbered',
        aliases: ['ol', 'list', 'number'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        },
      },
      {
        title: 'Task List',
        description: 'Create checklist items',
        icon: 'checklist',
        aliases: ['todo', 'checklist'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleTaskList().run();
        },
      },
      {
        title: 'Table',
        description: 'Insert a 3 x 3 table with a header',
        icon: 'table',
        aliases: ['grid', 'rows', 'columns'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        },
      },
      {
        title: 'Quote',
        description: 'Add a quoted block',
        icon: 'format_quote',
        aliases: ['blockquote'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        },
      },
      {
        title: 'Inline Code',
        description: 'Mark selected text as code',
        icon: 'code',
        aliases: ['code', 'monospace'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleCode().run();
        },
      },
      {
        title: 'Code Block',
        description: 'Insert a preformatted code block',
        icon: 'code_blocks',
        aliases: ['pre', 'snippet'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        },
      },
      {
        title: 'Divider',
        description: 'Insert a horizontal rule',
        icon: 'horizontal_rule',
        aliases: ['rule', 'separator', 'hr'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        },
      },
      {
        title: 'Image',
        description: 'Embed an image from a URL',
        icon: 'image',
        aliases: ['photo', 'picture'],
        command: ({ editor, range }: any) => {
          const url = prompt('Paste image URL');
          if (url) {
            editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
          }
        },
      },
      {
        title: 'Link',
        description: 'Insert linked text',
        icon: 'add_link',
        aliases: ['url', 'anchor'],
        command: ({ editor, range }: any) => {
          const url = prompt('Enter link URL');
          if (!url) return;

          const label = prompt('Link text', url) || url;
          editor.chain().focus().deleteRange(range).insertContent({
            type: 'text',
            text: label,
            marks: [{ type: 'link', attrs: { href: url } }],
          }).run();
        },
      },
      {
        title: 'YouTube Video',
        description: 'Embed a YouTube player',
        icon: 'smart_display',
        aliases: ['video', 'embed'],
        command: ({ editor, range }: any) => {
          const url = prompt('Enter YouTube URL');
          if (url) {
            editor.chain().focus().deleteRange(range).setYoutubeVideo({ src: url }).run();
          }
        },
      },
      {
        title: 'Timestamp',
        description: 'Insert the current date and time',
        icon: 'schedule',
        aliases: ['date', 'time', 'now'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).insertContent(new Date().toLocaleString()).run();
        },
      },
      {
        title: 'Clear Formatting',
        description: 'Remove marks and reset the block style',
        icon: 'format_clear',
        aliases: ['clean', 'reset'],
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).unsetAllMarks().clearNodes().run();
        },
      },
    ];
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return commands.slice(0, 12);
    }

    return commands
      .filter((item) =>
        [item.title, item.description, ...item.aliases].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
      .slice(0, 12);
  },

  render: () => {
    let component: ReactRenderer<any>;
    let popup: any;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(CommandList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
};

export default suggestion;
