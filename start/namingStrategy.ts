import { BaseModel, SnakeCaseNamingStrategy } from "@adonisjs/lucid/orm";

class CamelCaseNamingStrategy extends SnakeCaseNamingStrategy {
  public serializedName(_model: typeof BaseModel, propertyName: string): string {
    return propertyName;
  }
}

BaseModel.namingStrategy = new CamelCaseNamingStrategy();
