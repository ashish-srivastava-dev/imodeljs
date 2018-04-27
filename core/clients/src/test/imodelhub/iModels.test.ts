/*---------------------------------------------------------------------------------------------
|  $Copyright: (c) 2018 Bentley Systems, Incorporated. All rights reserved. $
 *--------------------------------------------------------------------------------------------*/
import * as chai from "chai";
import * as fs from "fs";

import { TestConfig } from "../TestConfig";

import { IModel, SeedFile, IModelHubResponseError, IModelHubResponseErrorId, IModelQuery } from "../../imodelhub";
import { IModelHubClient } from "../../imodelhub/Client";
import { AuthorizationToken, AccessToken } from "../../Token";
import { ConnectClient, Project } from "../../ConnectClients";
import { WsgError } from "../../WsgClient";
import { ResponseBuilder, RequestType, ScopeType } from "../ResponseBuilder";
import { AzureFileHandler } from "../../imodelhub/AzureFileHandler";
import * as utils from "./TestUtils";

declare const __dirname: string;

async function deleteiModelByName(imodelHubClient: IModelHubClient, accessToken: AccessToken, projectId: string, imodelName: string): Promise<void> {
  const imodels = await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byName(imodelName));
  if (imodels.length > 0) {
    await imodelHubClient.IModels().delete(accessToken, projectId, imodels[0].wsgId);
  }
}

describe("iModelHub iModelHandler", () => {
  let accessToken: AccessToken;
  let projectId: string;
  let testiModelName: string | undefined;
  const imodelHubClient: IModelHubClient = new IModelHubClient(TestConfig.deploymentEnv, new AzureFileHandler());
  const responseBuilder: ResponseBuilder = new ResponseBuilder();

  before(async () => {
    projectId = await utils.getProjectId();
    accessToken = await utils.login();
  });

  afterEach(async () => {
    responseBuilder.clearMocks();
    if (!TestConfig.enableMocks) {
      if (testiModelName) {
        await deleteiModelByName(imodelHubClient, accessToken, projectId, testiModelName);
        testiModelName = undefined;
      }
    }
  });

  it("should get list of IModels", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel");
    const requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                                            new Map<string, any>([["name", TestConfig.iModelName]])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    const imodels: IModel[] = await imodelHubClient.IModels().get(accessToken, projectId);
    chai.expect(imodels.length).to.be.greaterThan(0);
  });

  it("should get a specific IModel", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId,
                      "iModel", "?$filter=Name+eq+%27" + TestConfig.iModelName + "%27");
    const requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                                            new Map<string, any>([["name", TestConfig.iModelName]])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    const iModel: IModel = (await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byName(TestConfig.iModelName)))[0];
    chai.expect(iModel.name).equals(TestConfig.iModelName);
  });

  it.skip("should be able to delete iModels", async () => {
    // Used only for maintenance
    const names = ["22_LargePlant.166.i"];
    for (const name of names) {
      const requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
        new Map<string, any>([["name", name],
        ["wsgId", Math.random()]])));
      let requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId,
                                         "iModel", `?$filter=Name+eq+%27${name}%27`);
      responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

      const iModel: IModel = (await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byName(name)))[0];
      chai.expect(iModel.name).equals(name);

      requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId,
                                                           "iModel", iModel.wsgId);
      responseBuilder.MockResponse(RequestType.Delete, requestPath, "");
      await imodelHubClient.IModels().delete(accessToken, projectId, iModel.wsgId);
    }
  });
});

describe("iModelHub iModelHandler for a specific iModel", () => {
  let accessToken: AccessToken;
  let projectId: string;
  let iModelId: string;
  const connectClient = new ConnectClient(TestConfig.deploymentEnv);
  const imodelHubClient: IModelHubClient = new IModelHubClient(TestConfig.deploymentEnv, new AzureFileHandler());
  const downloadToPath: string = __dirname + "/../assets/";
  const responseBuilder: ResponseBuilder = new ResponseBuilder();

  before(async () => {
    const authToken: AuthorizationToken = await TestConfig.login();
    accessToken = await connectClient.getAccessToken(authToken);

    const project: Project | undefined = await connectClient.getProject(accessToken, {
      $select: "*",
      $filter: "Name+eq+'" + TestConfig.projectName + "'",
    });
    chai.expect(project);

    projectId = project.wsgId;
    chai.expect(projectId);

    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel",
                                              "?$filter=Name+eq+%27" + TestConfig.iModelName + "%27");
    const requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                                            new Map<string, any>([
                                              ["wsgId", "b74b6451-cca3-40f1-9890-42c769a28f3e"],
                                              ["name", TestConfig.iModelName],
                                            ])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);
    const iModels = await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byName(TestConfig.iModelName));

    if (!iModels[0].wsgId) {
      chai.assert(false);
      return;
    }

    iModelId = iModels[0].wsgId;

    if (!fs.existsSync(downloadToPath)) {
      fs.mkdirSync(downloadToPath);
    }
  });

  afterEach(() => {
    responseBuilder.clearMocks();
  });

  it("should get the Id", async () => {
    chai.expect(iModelId.length).equals(36); // length of a guid string
  });

  it("should retrieve an iModel by it's id", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel", iModelId);
    const requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                                            new Map<string, any>([["wsgId", iModelId]])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    const iModel: IModel = (await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byId(iModelId)))[0];

    chai.expect(iModel.wsgId).equals(iModelId);
  });

  it("should fail getting an invalid iModel", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel", "00000000-0000-0000-0000-000000000000");
    responseBuilder.MockResponse(RequestType.Get, requestPath, responseBuilder.generateError("InstanceNotFound"),
      1, undefined, undefined, 404);

    let error: WsgError | undefined;
    try {
      await imodelHubClient.IModels().get(accessToken, projectId, new IModelQuery().byId("00000000-0000-0000-0000-000000000000"));
    } catch (err) {
      if (err instanceof WsgError)
        error = err;
    }
    chai.assert(error);
    chai.expect(error!.name === "InstanceNotFound");
  });

  it("should fail getting an iModel without projectId", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, "", "iModel", iModelId);
    responseBuilder.MockResponse(RequestType.Get, requestPath,
      responseBuilder.generateError("iModelHub.ProjectIdIsNotSpecified"),
      1, undefined, undefined, 400);
    let error: IModelHubResponseError | undefined;
    try {
      await imodelHubClient.IModels().get(accessToken, "", new IModelQuery().byId(iModelId));
    } catch (err) {
      if (err instanceof IModelHubResponseError)
        error = err;
    }

    chai.expect(error);
    chai.expect(error!.id === IModelHubResponseErrorId.ProjectIdIsNotSpecified);
  });

  (TestConfig.enableMocks ? it : it.skip)("should fail creating existing and initialized iModel", async () => {
    const requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel");
    const requestResponse = responseBuilder.generateError("iModelHub.iModelAlreadyExists", "iModel already exists", undefined,
                                                          new Map<string, any>([["iModelInitialized", true]]));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, undefined, undefined, 409);

    let error: IModelHubResponseError | undefined;
    try {
      await imodelHubClient.IModels().create(accessToken, projectId, TestConfig.iModelName,
        downloadToPath + "empty-files/empty.bim");
    } catch (err) {
      if (err instanceof IModelHubResponseError)
        error = err;
    }
    chai.expect(error);
    chai.expect(error!.id === IModelHubResponseErrorId.iModelAlreadyExists);
  });

  (TestConfig.enableMocks ? it : it.skip)("should create iModel and upload SeedFile", async () => {
    let requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel");
    let postBody = responseBuilder.generatePostBody<IModel>(
                      responseBuilder.generateObject<IModel>(IModel,
                        new Map<string, any>([["name", TestConfig.iModelName]])));
    let requestResponse = responseBuilder.generatePostResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                                new Map<string, any>([
                                  ["wsgId", iModelId],
                                  ["name", TestConfig.iModelName],
                                  ["initialized", true],
                                ])));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody);

    // SeedFile upload
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile");
    postBody = responseBuilder.generatePostBody<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                          new Map<string, any>([["fileName", "empty.bim"], ["fileSize", "0"]])));
    requestResponse = responseBuilder.generatePostResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                                new Map<string, any>([
                                  ["wsgId", "00000000-0000-0000-0000-000000000000"],
                                  ["fileId", "123456"],
                                  ["fileName", "empty.bim"],
                                  ["uploadUrl", `https://qa-imodelhubapi.bentley.com/imodelhub-${iModelId}/123456`],
                                ])));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody);

    // SeedFile upload to blob storage
    responseBuilder.MockResponse(RequestType.Put, `/imodelhub-${iModelId}/123456`, "");
    // confirmSeedFile
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile", "00000000-0000-0000-0000-000000000000");
    postBody = responseBuilder.generatePostBody<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
      new Map<string, any>([["wsgId", "00000000-0000-0000-0000-000000000000"], ["fileName", "empty.bim"], ["fileId", "123456"], ["isUploaded", true]])));

    requestResponse = responseBuilder.generatePostResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                                new Map<string, any>([
                                  ["fileId", "123456"],
                                  ["wsgId", "00000000-0000-0000-0000-000000000000"],
                                  ["isUploaded", true],
                                ])));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody);

    // get SeedFile initialization state
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile");
    requestResponse = responseBuilder.generateGetResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                       new Map<string, any>([["initializationState", 0]])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    const iModel = await imodelHubClient.IModels().create(accessToken, projectId, TestConfig.iModelName,
                      downloadToPath + "empty-files/empty.bim");

    chai.expect(iModel.wsgId).equals(iModelId);
    chai.expect(iModel.name).equals(TestConfig.iModelName);
    chai.expect(iModel.initialized).equals(true);
  });

  (TestConfig.enableMocks ? it : it.skip)("should continue creating not initialized iModel", async () => {
    let requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel");
    let postBody = responseBuilder.generatePostBody<IModel>(
                      responseBuilder.generateObject<IModel>(IModel,
                        new Map<string, any>([["name", TestConfig.iModelName]])));
    let requestResponse = responseBuilder.generateError("iModelHub.iModelAlreadyExists", "iModel already exists", undefined,
                                                          new Map<string, any>([["iModelInitialized", false]]));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody, undefined, 409);

    requestPath = responseBuilder.createRequestUrl(ScopeType.Project, projectId, "iModel", `?$filter=Name+eq+%27${TestConfig.iModelName}%27`);
    requestResponse = responseBuilder.generateGetResponse<IModel>(responseBuilder.generateObject<IModel>(IModel,
                        new Map<string, any>([
                          ["wsgId", iModelId],
                          ["name", TestConfig.iModelName],
                          ["initialized", true],
                        ])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    // SeedFile upload
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile");
    postBody = responseBuilder.generatePostBody<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                                              new Map<string, any>([["fileName", "empty.bim"], ["fileSize", "0"]])));
    requestResponse = responseBuilder.generatePostResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                                new Map<string, any>([
                                  ["wsgId", "00000000-0000-0000-0000-000000000000"],
                                  ["fileId", "123456"],
                                  ["fileName", "empty.bim"],
                                  ["uploadUrl", `https://qa-imodelhubapi.bentley.com/imodelhub-${iModelId}/123456`],
                                ])));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody);

    // SeedFile upload to blob storage
    responseBuilder.MockResponse(RequestType.Put, `/imodelhub-${iModelId}/123456`, "");
    // confirmSeedFile
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile", "00000000-0000-0000-0000-000000000000");
    postBody = responseBuilder.generatePostBody<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
      new Map<string, any>([["wsgId", "00000000-0000-0000-0000-000000000000"], ["fileName", "empty.bim"], ["fileId", "123456"], ["isUploaded", true]])));

    requestResponse = responseBuilder.generatePostResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                                new Map<string, any>([
                                  ["fileId", "123456"],
                                  ["wsgId", "00000000-0000-0000-0000-000000000000"],
                                  ["isUploaded", true],
                                ])));
    responseBuilder.MockResponse(RequestType.Post, requestPath, requestResponse, 1, postBody);

    // get SeedFile initialization state
    requestPath = responseBuilder.createRequestUrl(ScopeType.iModel, iModelId, "SeedFile");
    requestResponse = responseBuilder.generateGetResponse<SeedFile>(responseBuilder.generateObject<SeedFile>(SeedFile,
                       new Map<string, any>([["initializationState", 0]])));
    responseBuilder.MockResponse(RequestType.Get, requestPath, requestResponse);

    const iModel = await imodelHubClient.IModels().create(accessToken, projectId, TestConfig.iModelName,
      downloadToPath + "empty-files/empty.bim");

    chai.expect(iModel.wsgId).equals(iModelId);
    chai.expect(iModel.name).equals(TestConfig.iModelName);
    chai.expect(iModel.initialized).equals(true);
  });
});
