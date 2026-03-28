import Link from 'next/link';

type CommunityBreadcrumbItem = {
  href?: string;
  label: string;
};

type CommunityBreadcrumbProps = {
  items: CommunityBreadcrumbItem[];
};

export default function CommunityBreadcrumb({
  items,
}: CommunityBreadcrumbProps) {
  return (
    <div className="forum-breadcrumb">
      <div className="forum-breadcrumb-inner">
        {items.map((item, index) => (
          <span key={`${item.label}-${index}`} className="forum-breadcrumb-item">
            {item.href ? (
              <Link className="forum-breadcrumb-link" href={item.href}>
                {item.label}
              </Link>
            ) : (
              <span className="forum-breadcrumb-current">{item.label}</span>
            )}
            {index < items.length - 1 ? (
              <span className="forum-breadcrumb-separator">&gt;</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
