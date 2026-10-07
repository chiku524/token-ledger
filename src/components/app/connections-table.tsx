import { connectionStatusTone, StatusBadge } from "@/components/app/status-badge";
import { TableCard } from "@/components/app/table-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConnectionControls } from "@/components/record-forms";
import type { Books } from "@/data/books";
import { connectionModeLabel, connectionStatusLabel, entityName, ownershipLabel, scopeLabel, venueLabel } from "@/data/present";

export function ConnectionsTable({
  books,
  controls,
}: {
  books: Pick<Books, "connections" | "sources" | "entities">;
  controls?: { csrf: string; next?: string };
}) {
  return (
    <TableCard>
      <Table>
        <caption className="sr-only">{controls ? "Connections and their actions" : "Read-only connections"}</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Company</TableHead>
            <TableHead scope="col">Connection</TableHead>
            <TableHead scope="col">Access</TableHead>
            <TableHead scope="col">Ownership</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Last checked</TableHead>
            {controls ? <TableHead scope="col">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {books.connections.map((connection) => {
            const accounts = books.sources.filter((source) => source.connectionId === connection.id);
            return (
              <TableRow key={connection.id}>
                <TableCell className="min-w-36">{entityName(connection.entityId, books.entities)}</TableCell>
                <TableCell className="min-w-44">
                  <span className="block">{connection.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {accounts.length === 0 ? "No account yet" : accounts.map((source) => source.name).join(", ")}
                  </span>
                </TableCell>
                <TableCell className="min-w-40">
                  <span className="block">{connectionModeLabel(connection.mode)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {venueLabel(connection.venue)} · {scopeLabel(connection.scopes)}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={connection.ownership === "verified" ? "success" : "neutral"}>
                    {ownershipLabel(connection.ownership)}
                  </StatusBadge>
                  {connection.verifiedAddress ? (
                    <span className="mt-1 block font-mono text-xs text-muted-foreground">{connection.verifiedAddress}</span>
                  ) : (
                    <span className="mt-1 block text-xs text-muted-foreground">Not signed</span>
                  )}
                </TableCell>
                <TableCell className="min-w-56">
                  <StatusBadge tone={connectionStatusTone(connection.status)}>
                    {connectionStatusLabel(connection.status)}
                  </StatusBadge>
                  {connection.lastError ? <span className="mt-1 block text-xs text-danger">{connection.lastError}</span> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{connection.lastSyncedAt ? connection.lastSyncedAt.slice(0, 10) : "Not yet"}</TableCell>
                {controls ? (
                  <TableCell>
                    <ConnectionControls
                      connectionId={connection.id}
                      csrf={controls.csrf}
                      revoked={connection.status === "revoked"}
                      next={controls.next}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
