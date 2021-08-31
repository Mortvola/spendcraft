import { BaseModel, SnakeCaseNamingStrategy } from "@ioc:Adonis/Lucid/Orm";

class CamelCaseNamingStrategy extends SnakeCaseNamingStrategy {
  public serializedName(_model: typeof BaseModel, propertyName: string): string {
    return propertyName;
  }
}

BaseModel.namingStrategy = new CamelCaseNamingStrategy();
