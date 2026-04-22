import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

const CommandList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  if (!props.items.length) {
    return null;
  }

  return (
    <div className="flex w-64 flex-col gap-1 rounded-xl border border-white/5 bg-surface-container-highest p-2 shadow-2xl text-on-surface">
      {props.items.map((item: any, index: number) => (
        <button
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-all ${
            index === selectedIndex ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface hover:text-white'
          }`}
          key={index}
          onClick={() => selectItem(index)}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
});

export default CommandList;
