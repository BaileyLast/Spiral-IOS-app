import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Clock, CheckCircle, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Verification } from "@shared/schema";

interface VerificationsTableProps {
  verifications: Verification[];
}

// Status configuration with colors and labels
const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: "Awaiting Story", variant: "secondary", icon: Clock },
  story_detected: { label: "Story Detected", variant: "outline", icon: Eye },
  verified: { label: "Verified", variant: "default", icon: CheckCircle },
  failed: { label: "Failed", variant: "destructive", icon: XCircle },
};

export function VerificationsTable({ verifications }: VerificationsTableProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return "—";
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const formatFollowerCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    
    return (
      <Badge 
        variant={config.variant}
        className={`gap-1 ${status === 'verified' ? 'bg-green-100 text-green-700 border-green-200' : ''} ${status === 'story_detected' ? 'bg-blue-100 text-blue-700 border-blue-200' : ''}`}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getRelevantDate = (verification: Verification) => {
    if (verification.verifiedAt) return formatDate(verification.verifiedAt);
    if (verification.failedAt) return formatDate(verification.failedAt);
    if (verification.storyDetectedAt) return formatDate(verification.storyDetectedAt);
    return formatDate(verification.createdAt);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Shopper Email</TableHead>
            <TableHead className="font-semibold">Instagram</TableHead>
            <TableHead className="font-semibold">Followers</TableHead>
            <TableHead className="font-semibold">Discount</TableHead>
            <TableHead className="font-semibold">Story</TableHead>
            <TableHead className="font-semibold">Status</TableHead>
            <TableHead className="font-semibold">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {verifications.map((verification) => (
            <TableRow key={verification.id} data-testid={`row-verification-${verification.id}`}>
              <TableCell className="font-medium" data-testid={`text-email-${verification.id}`}>
                {verification.shopperEmail}
              </TableCell>
              <TableCell data-testid={`text-instagram-${verification.id}`}>
                <span className="text-[#5729a3] font-medium">@{verification.instagramHandle}</span>
              </TableCell>
              <TableCell data-testid={`text-followers-${verification.id}`}>
                <span className="font-semibold">{formatFollowerCount(verification.followerCount)}</span>
              </TableCell>
              <TableCell data-testid={`text-discount-${verification.id}`}>
                ${parseFloat(verification.discountAmount).toFixed(2)}
              </TableCell>
              <TableCell>
                {verification.storyUrl ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    data-testid={`link-story-${verification.id}`}
                  >
                    <a href={verification.storyUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell data-testid={`text-status-${verification.id}`}>
                {getStatusBadge(verification.status)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm" data-testid={`text-date-${verification.id}`}>
                {getRelevantDate(verification)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
