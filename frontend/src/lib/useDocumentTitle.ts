import { useEffect } from "react";

/**
 * Sets a route-specific document title: "<page> | Caventas".
 * Pass null for the bare brand title.
 */
export function useDocumentTitle(page: string | null) {
  useEffect(() => {
    const previous = document.title;
    document.title = page ? `${page} | Caventas` : "Caventas";
    return () => {
      document.title = previous;
    };
  }, [page]);
}