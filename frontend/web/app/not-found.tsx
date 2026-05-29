export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-lg rounded-lg border border-line bg-panel p-10 text-center shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Not Found</p>
        <h1 className="mt-4 text-3xl font-bold">The requested analysis view was not available.</h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          The analysis may have expired from the in-memory API store or the dependency identifier was incorrect.
        </p>
      </div>
    </div>
  );
}
