import { Button, Heading } from "@modules/common/components/ui";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
const Hero = () => {
  return (
    <div className="h-[320px] small:h-[420px] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center px-6 small:p-32 gap-6">
        <span>
          <Heading
            level="h1"
            className="text-2xl leading-9 small:text-3xl small:leading-10 text-ui-fg-base font-normal"
          >
            3days 쇼핑
          </Heading>
          <Heading
            level="h2"
            className="text-2xl leading-9 small:text-3xl small:leading-10 text-ui-fg-subtle font-normal"
          >
            실제 주문까지 되는 데모 스토어
          </Heading>
        </span>
        <LocalizedClientLink href="/store">
          <Button variant="primary" className="rounded-xl h-[52px] px-6">
            상품 둘러보기
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  );
};

export default Hero;
