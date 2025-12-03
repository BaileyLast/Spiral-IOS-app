import { VerificationsTable } from "@/components/VerificationsTable";
import { useQuery } from "@tanstack/react-query";
import type { Verification } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Verifications() {
  const { toast } = useToast();
  const { data: verifications = [], isLoading, isError, error } = useQuery<Verification[]>({
    queryKey: ["/api/verifications"],
  });

  useEffect(() => {
    if (isError) {
      toast({
        description: error instanceof Error ? error.message : "Failed to load verifications",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Verifications
            </h1>
            <p className="text-muted-foreground mt-2">Track Instagram verification requests from shoppers</p>
          </div>
          <div className="h-96 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
              Verifications
            </h1>
            <p className="text-muted-foreground mt-2">Track Instagram verification requests from shoppers</p>
          </div>
          <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-destructive/10">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load verifications</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "An unexpected error occurred"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#5729a3] to-[#935eb2] bg-clip-text text-transparent">
            Verifications
          </h1>
          <p className="text-muted-foreground mt-2">Track Instagram verification requests from shoppers</p>
        </div>
        {verifications.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg">
            No verifications yet. Verifications will appear here when shoppers complete the Instagram verification process.
          </div>
        ) : (
          <VerificationsTable verifications={verifications} />
        )}
      </div>
    </div>
  );
}
