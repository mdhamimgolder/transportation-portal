-- CreateIndex
CREATE INDEX "AdHocRequest_status_date_idx" ON "AdHocRequest"("status", "date");

-- CreateIndex
CREATE INDEX "EmailNotificationLog_routeAssignmentId_createdAt_idx" ON "EmailNotificationLog"("routeAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "PickupPoint_vehicleId_isActive_idx" ON "PickupPoint"("vehicleId", "isActive");

-- CreateIndex
CREATE INDEX "PickupPoint_addressId_isActive_idx" ON "PickupPoint"("addressId", "isActive");

-- CreateIndex
CREATE INDEX "PickupPoint_isActive_idx" ON "PickupPoint"("isActive");

-- CreateIndex
CREATE INDEX "RouteAssignment_assignedAt_idx" ON "RouteAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "RoutePlan_weekStartDate_dayOfWeek_status_idx" ON "RoutePlan"("weekStartDate", "dayOfWeek", "status");

-- CreateIndex
CREATE INDEX "RoutePlan_vehicleId_dayDate_arrivalTime_idx" ON "RoutePlan"("vehicleId", "dayDate", "arrivalTime");

-- CreateIndex
CREATE INDEX "TripAssignment_routePlanId_idx" ON "TripAssignment"("routePlanId");

-- CreateIndex
CREATE INDEX "TripAssignment_routePlanId_vehicleId_idx" ON "TripAssignment"("routePlanId", "vehicleId");

-- CreateIndex
CREATE INDEX "User_fullName_idx" ON "User"("fullName");

-- CreateIndex
CREATE INDEX "User_role_fixedArrivalActive_isActive_idx" ON "User"("role", "fixedArrivalActive", "isActive");

-- CreateIndex
CREATE INDEX "VehicleShiftAssignment_startDate_isActive_idx" ON "VehicleShiftAssignment"("startDate", "isActive");

-- CreateIndex
CREATE INDEX "WeeklySchedule_status_weekStartDate_idx" ON "WeeklySchedule"("status", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyScheduleDay_dayOfWeek_needsTransport_arrivalTime_idx" ON "WeeklyScheduleDay"("dayOfWeek", "needsTransport", "arrivalTime");
