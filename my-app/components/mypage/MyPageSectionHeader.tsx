interface MyPageSectionHeaderProps {
  description?: string;
  title: string;
}

export function MyPageSectionHeader({
  description,
  title,
}: MyPageSectionHeaderProps) {
  return (
    <div>
      <h2 className="text-xl font-black text-[var(--app-text)]">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
