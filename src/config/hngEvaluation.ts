// Temporary public navigation for HNG evaluation; this is not an access grant.
// Before the business-owner launch, set showStaffLogin to false.
// Keep the permanent /admin route and its authorization checks unchanged.
export const hngEvaluation = {
  showStaffLogin: true,
} as const;
