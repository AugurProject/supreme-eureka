import * as ts from "typescript";
import { EmitHint, SyntaxKind } from "typescript";
import * as fs from "fs";
import { Addresses, MarketFactory } from "../addresses";

const printer = ts.createPrinter();

export function updateAddressConfig(addressFilePath: string, chainId: number, addresses: Addresses): void {
  const sourceFile = ts.createSourceFile(
    "addresses.ts",
    fs.readFileSync(addressFilePath, "utf8"),
    ts.ScriptTarget.Latest
  );

  const transformerFactory: ts.TransformerFactory<ts.Node> = (context: ts.TransformationContext) => {
    return (rootNode) => {
      function addAddressToObject(node: ts.VariableDeclaration): ts.VariableDeclaration {
        const objectDef = node.getChildAt(4, sourceFile);
        if (ts.isObjectLiteralExpression(objectDef)) {
          return context.factory.createVariableDeclaration(
            node.name,
            node.exclamationToken,
            node.type,
            context.factory.createObjectLiteralExpression([
              // Remove object with passed chainId if present.
              ...objectDef.properties.filter((node) => {
                return node.name?.getText(sourceFile) !== `${chainId}`;
              }),
              context.factory.createPropertyAssignment(
                `${chainId}`,
                ts.factory.createObjectLiteralExpression(
                  Object.entries(addresses).map(([key, val]) => {
                    if (key === "marketFactories") {
                      return context.factory.createPropertyAssignment(
                        `${key}`,
                        ts.factory.createArrayLiteralExpression(
                          (val as MarketFactory[]).map((marketFactory) => {
                            const fields = [
                              context.factory.createPropertyAssignment(
                                "type",
                                ts.factory.createStringLiteral(marketFactory.type)
                              ),
                              context.factory.createPropertyAssignment(
                                "subtype",
                                ts.factory.createStringLiteral(marketFactory.subtype)
                              ),
                              context.factory.createPropertyAssignment(
                                "address",
                                ts.factory.createStringLiteral(marketFactory.address)
                              ),
                              context.factory.createPropertyAssignment(
                                "collateral",
                                ts.factory.createStringLiteral(marketFactory.collateral)
                              ),
                              context.factory.createPropertyAssignment(
                                "ammFactory",
                                ts.factory.createStringLiteral(marketFactory.ammFactory)
                              ),
                              context.factory.createPropertyAssignment(
                                "fetcher",
                                ts.factory.createStringLiteral(marketFactory.fetcher)
                              ),
                            ];
                            if (marketFactory.description) {
                              fields.push(
                                context.factory.createPropertyAssignment(
                                  "description",
                                  ts.factory.createStringLiteral(marketFactory.description)
                                )
                              );
                            }
                            if (marketFactory.version) {
                              fields.push(
                                context.factory.createPropertyAssignment(
                                  "version",
                                  ts.factory.createStringLiteral(marketFactory.version)
                                )
                              );
                            }
                            return ts.factory.createObjectLiteralExpression(fields);
                          })
                        )
                      );
                    } else if (key === "info") {
                      return context.factory.createPropertyAssignment(
                        key,
                        ts.factory.createObjectLiteralExpression([
                          context.factory.createPropertyAssignment(
                            "uploadBlockNumber",
                            ts.factory.createNumericLiteral(addresses.info.uploadBlockNumber)
                          ),
                          context.factory.createPropertyAssignment(
                            "graphName",
                            ts.factory.createStringLiteral(addresses.info.graphName || "")
                          ),
                        ])
                      );
                    } else {
                      return context.factory.createPropertyAssignment(`${key}`, ts.factory.createStringLiteral(val));
                    }
                  })
                )
              ),
            ])
          );
        }

        return node;
      }

      function visit(node: ts.Node): ts.Node {
        if (ts.isSourceFile(node) || ts.isVariableDeclarationList(node) || node.kind == SyntaxKind.FirstStatement) {
          return ts.visitEachChild(node, visit, context);
        }

        if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === "addresses") {
          return addAddressToObject(node);
        }

        return node;
      }

      return ts.visitNode(rootNode, visit);
    };
  };

  const transformationResult = ts.transform(sourceFile, [transformerFactory]);
  const output = printer.printNode(EmitHint.Unspecified, transformationResult.transformed[0], sourceFile);

  fs.writeFileSync(addressFilePath, output);
}
