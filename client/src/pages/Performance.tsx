import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AlertCircle, 
  Eye, 
  PoundSterling, 
  TrendingUp, 
  CheckCircle2,
  Users,
  Repeat,
  ShoppingCart
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type PerformanceData = {
  summary: {
    totalVerifications: number;
    verifiedPosts: number;
    pendingPosts: number;
    completionRate: number;
    totalDiscountsGiven: number;
    avgDiscountAmount: number;
    totalEstimatedImpressions: number;
    impressionsPerPound: number;
    avgFollowerCount: number;
  };
  followerDistribution: { label: string; count: number }[];
  topPerformers: {
    id: string;
    instagramHandle: string;
    followerCount: number;
    estimatedReach: number;
    discountAmount: string;
    verifiedAt: string | null;
  }[];
  customerInsights: {
    uniqueCustomers: number;
    repeatCustomers: number;
    totalOrderValue: number;
    avgOrderValue: number;
  };
  verificationsOverTime: { date: string; count: number; impressions: number }[];
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon,
  gradient = "from-[#4ECCA3] to-[#2BAE88]"
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: typeof Eye;
  gradient?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function Performance() {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useQuery<PerformanceData>({
    queryKey: ["/api/performance"],
  });

  useEffect(() => {
    if (isError) {
      toast({
        description: error instanceof Error ? error.message : "Failed to load performance data",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4ECCA3] to-[#2BAE88] bg-clip-text text-transparent">
              Performance
            </h1>
            <p className="text-muted-foreground mt-2">Track your Spiral marketing impact</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
          <div className="h-80 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4ECCA3] to-[#2BAE88] bg-clip-text text-transparent">
              Performance
            </h1>
            <p className="text-muted-foreground mt-2">Track your Spiral marketing impact</p>
          </div>
          <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-destructive/10">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">Failed to load performance data</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "An unexpected error occurred"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasData = data && data.summary.totalVerifications > 0;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4ECCA3] to-[#2BAE88] bg-clip-text text-transparent">
            Performance
          </h1>
          <p className="text-muted-foreground mt-2">Track your Spiral marketing impact</p>
        </div>

        {!hasData ? (
          <Card className="p-12">
            <div className="text-center">
              <Eye className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No performance data yet</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Once customers start using Spiral discounts and posting Instagram stories, 
                you'll see detailed analytics about your marketing impact here.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Impressions"
                value={formatNumber(data.summary.totalEstimatedImpressions)}
                subtitle="Estimated reach from verified posts"
                icon={Eye}
              />
              <StatCard
                title="Discounts Given"
                value={`£${data.summary.totalDiscountsGiven.toLocaleString()}`}
                subtitle={`Avg £${data.summary.avgDiscountAmount} per order`}
                icon={PoundSterling}
                gradient="from-green-500 to-emerald-500"
              />
              <StatCard
                title="ROI"
                value={`${formatNumber(data.summary.impressionsPerPound)}`}
                subtitle="Impressions per £1 spent"
                icon={TrendingUp}
                gradient="from-blue-500 to-cyan-500"
              />
              <StatCard
                title="Verified Posts"
                value={data.summary.verifiedPosts}
                subtitle={`${data.summary.completionRate}% completion rate`}
                icon={CheckCircle2}
                gradient="from-amber-500 to-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StatCard
                title="Avg Follower Count"
                value={formatNumber(data.summary.avgFollowerCount)}
                subtitle="Average creator size"
                icon={Users}
              />
              <StatCard
                title="Spiral Customers"
                value={data.customerInsights.uniqueCustomers}
                subtitle={`${data.customerInsights.repeatCustomers} returning customers`}
                icon={ShoppingCart}
                gradient="from-[#4ECCA3] to-[#2BAE88]"
              />
              <StatCard
                title="Total Order Value"
                value={`£${data.customerInsights.totalOrderValue.toLocaleString()}`}
                subtitle={`Avg £${data.customerInsights.avgOrderValue} per order`}
                icon={Repeat}
                gradient="from-indigo-500 to-violet-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Impressions Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.verificationsOverTime}>
                        <defs>
                          <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ECCA3" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#4ECCA3" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => format(new Date(value), "MMM d")}
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => formatNumber(value)}
                          className="text-muted-foreground"
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-popover border rounded-lg p-3 shadow-lg">
                                  <p className="text-sm font-medium">
                                    {format(new Date(payload[0].payload.date), "MMM d, yyyy")}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatNumber(payload[0].value as number)} impressions
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {payload[0].payload.count} verifications
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="impressions" 
                          stroke="#4ECCA3" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorImpressions)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Creator Size Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.followerDistribution}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="label" 
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-popover border rounded-lg p-3 shadow-lg">
                                  <p className="text-sm font-medium">
                                    {payload[0].payload.label} followers
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {payload[0].value} creators
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="count" 
                          fill="#2BAE88"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Performing Posts</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topPerformers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No verified posts yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead className="text-right">Followers</TableHead>
                        <TableHead className="text-right">Est. Reach</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Verified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topPerformers.map((performer) => (
                        <TableRow key={performer.id} data-testid={`row-performer-${performer.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">@{performer.instagramHandle}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">
                              {formatNumber(performer.followerCount)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(performer.estimatedReach)}
                          </TableCell>
                          <TableCell className="text-right">
                            £{parseFloat(performer.discountAmount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {performer.verifiedAt 
                              ? format(new Date(performer.verifiedAt), "MMM d, yyyy")
                              : "-"
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Verification Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Verified</span>
                    <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                      {data.summary.verifiedPosts}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Pending</span>
                    <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">
                      {data.summary.pendingPosts}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Completion Rate</span>
                    <Badge variant="secondary">
                      {data.summary.completionRate}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
