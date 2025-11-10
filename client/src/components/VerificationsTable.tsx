import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Verification {
  id: string;
  shopperEmail: string;
  instagramHandle: string;
  followerCount: number;
  postUrl: string;
  status: string;
  verifiedAt: Date;
}

interface VerificationsTableProps {
  verifications: Verification[];
}

export function VerificationsTable({ verifications }: VerificationsTableProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const formatFollowerCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Shopper Email</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Followers</TableHead>
            <TableHead>Post</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {verifications.map((verification) => (
            <TableRow key={verification.id} data-testid={`row-verification-${verification.id}`}>
              <TableCell className="font-medium" data-testid={`text-email-${verification.id}`}>
                {verification.shopperEmail}
              </TableCell>
              <TableCell data-testid={`text-instagram-${verification.id}`}>
                {verification.instagramHandle}
              </TableCell>
              <TableCell data-testid={`text-followers-${verification.id}`}>
                {formatFollowerCount(verification.followerCount)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  data-testid={`link-post-${verification.id}`}
                >
                  <a href={verification.postUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </TableCell>
              <TableCell>
                <StatusBadge
                  active={verification.status === "verified"}
                  activeLabel="Verified"
                  inactiveLabel="Pending"
                />
              </TableCell>
              <TableCell className="text-muted-foreground" data-testid={`text-date-${verification.id}`}>
                {formatDate(verification.verifiedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
