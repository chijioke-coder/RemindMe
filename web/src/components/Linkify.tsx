import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Shows text with any web address turned into a link that opens in a new tab. */
export default function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const trail = part.match(/[.,;:!?)]+$/)?.[0] ?? '';
        const url = trail ? part.slice(0, -trail.length) : part;
        return (
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noreferrer noopener">{url}</a>{trail}
          </Fragment>
        );
      })}
    </>
  );
}
