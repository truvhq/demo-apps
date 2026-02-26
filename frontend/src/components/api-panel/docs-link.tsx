import { IconExternalLink } from "@tabler/icons-react";

interface DocsLinkProps {
  label: string;
  url: string;
}

export function DocsLink({ label, url }: DocsLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
    >
      <IconExternalLink size={14} />
      {label}
    </a>
  );
}
