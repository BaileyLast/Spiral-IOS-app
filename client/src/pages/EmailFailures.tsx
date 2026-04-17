import { useQuery } from "@tanstack/react-query";
import type { EmailSendFailure } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const EMAIL_TYPE_LABELS: Record<string, string> = {
  verification: "Verification",
  welcome: "Welcome",
  instagram_connected: "Instagram Connected",
};

export default function EmailFailures() {
  const { data: failures = [], isLoading, isError } = useQuery<EmailSendFailure[]>({
    queryKey: ["/api/admin/email-failures"],
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Email send failures</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recent emails that Resend rejected or that failed to send. Use this to spot delivery problems early.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Recent failures
          </CardTitle>
          <CardDescription>
            Showing the most recent {failures.length} failure{failures.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground" data-testid="text-loading">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive" data-testid="text-error">Could not load email failures.</p>
          ) : failures.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No email failures recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((f) => (
                  <TableRow key={f.id} data-testid={`row-failure-${f.id}`}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-when-${f.id}`}>
                      {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell data-testid={`text-type-${f.id}`}>
                      <Badge variant="secondary">{EMAIL_TYPE_LABELS[f.emailType] ?? f.emailType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-recipient-${f.id}`}>{f.recipient}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-reason-${f.id}`}>
                      <div className="flex flex-col gap-1">
                        <span>{f.reason}</span>
                        {f.errorName && (
                          <span className="text-xs text-muted-foreground">{f.errorName}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
