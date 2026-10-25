import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { EvaluationReportResponseSchema } from "@warrant/contracts";
import { generateEvaluationReport } from "../services/evaluationReportService.js";
import { extractRequestId } from "./routeUtils.js";

export const evaluationRoutes: FastifyPluginAsync = async (fastify) => {
  // GET / or GET /report - Generates live Evaluation Report
  const handleGetReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const report = await generateEvaluationReport();
      const responsePayload = { report };

      // Validate against shared response contract
      const validated = EvaluationReportResponseSchema.parse(responsePayload);
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to generate evaluation report");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate evaluation report.",
        },
        requestId,
      });
    }
  };

  fastify.get("/", handleGetReport);
  fastify.get("/report", handleGetReport);
};
