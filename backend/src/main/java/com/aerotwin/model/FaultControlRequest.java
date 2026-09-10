package com.aerotwin.model;

/**
 * Request body for POST /api/simulator/fault. faultType=NORMAL (or omitted) resets the live
 * simulator to healthy. severity is an optional fixed override; when null, the fault ramps
 * in over time using the same schedule as the offline dataset generator.
 */
public record FaultControlRequest(FaultType faultType, Double severity) {
}
